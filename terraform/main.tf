terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.90"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.8"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    RegionFocus = "mena"
  }
}

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}"
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = var.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres-subnet-group"
  })
}

resource "aws_security_group" "postgres" {
  name        = "${local.name_prefix}-postgres"
  description = "Managed PostgreSQL access for NexusZero"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.application_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres-sg"
  })
}

resource "aws_db_instance" "postgres" {
  identifier                             = "${local.name_prefix}-postgres"
  engine                                 = "postgres"
  engine_version                         = var.postgres_engine_version
  instance_class                         = var.postgres_instance_class
  allocated_storage                      = var.postgres_allocated_storage
  max_allocated_storage                  = var.postgres_max_allocated_storage
  db_name                                = var.postgres_database_name
  username                               = var.postgres_username
  password                               = random_password.db_password.result
  port                                   = 5432
  storage_encrypted                      = true
  backup_retention_period                = var.postgres_backup_retention_days
  backup_window                          = var.postgres_backup_window
  maintenance_window                     = var.postgres_maintenance_window
  auto_minor_version_upgrade             = true
  deletion_protection                    = true
  copy_tags_to_snapshot                  = true
  delete_automated_backups               = false
  enabled_cloudwatch_logs_exports        = ["postgresql", "upgrade"]
  performance_insights_enabled           = true
  performance_insights_retention_period  = 7
  iam_database_authentication_enabled    = true
  apply_immediately                      = false
  publicly_accessible                    = false
  db_subnet_group_name                   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids                 = [aws_security_group.postgres.id]
  skip_final_snapshot                    = false
  final_snapshot_identifier              = "${local.name_prefix}-postgres-final"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

resource "cloudflare_r2_bucket" "assets" {
  account_id    = var.cloudflare_account_id
  name          = var.r2_bucket_name
  location_hint = var.r2_location_hint
}

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.cloudflare_zone_id
  name        = "${local.name_prefix}-custom-waf"
  description = "Enterprise WAF for NexusZero MENA production traffic"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      action      = "block"
      expression  = "cf.waf.score lt 20"
      description = "Block very high-risk traffic"
      enabled     = true
    },
    {
      action      = "managed_challenge"
      expression  = "(ip.geoip.country ne \"${var.primary_market_country}\") and (http.request.uri.path contains \"/login\" or http.request.uri.path contains \"/api/\")"
      description = "Challenge sensitive traffic originating outside the primary operating market"
      enabled     = true
    },
    {
      action      = "skip"
      expression  = "ip.src in {${join(" ", formatlist("\"%s\"", var.office_ip_allowlist))}}"
      description = "Skip WAF challenges for office and trusted egress IPs"
      enabled     = length(var.office_ip_allowlist) > 0
    },
  ]
}

output "postgres_endpoint" {
  value       = aws_db_instance.postgres.address
  description = "Managed PostgreSQL endpoint"
}

output "postgres_password" {
  value       = random_password.db_password.result
  description = "Generated database password"
  sensitive   = true
}

output "r2_bucket_name" {
  value       = cloudflare_r2_bucket.assets.name
  description = "Cloudflare R2 bucket for generated assets"
}