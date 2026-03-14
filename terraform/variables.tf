variable "project_name" {
  description = "Project slug used for naming resources"
  type        = string
  default     = "nexuszero"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for managed PostgreSQL"
  type        = string
  default     = "eu-central-1"
}

variable "vpc_id" {
  description = "VPC ID hosting application workloads"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the RDS subnet group"
  type        = list(string)
}

variable "application_security_group_ids" {
  description = "Security groups attached to EKS/GKE-connected application workloads allowed to reach Postgres"
  type        = list(string)
}

variable "postgres_database_name" {
  description = "Primary application database name"
  type        = string
  default     = "nexuszero"
}

variable "postgres_username" {
  description = "Managed PostgreSQL admin username"
  type        = string
  default     = "nexuszero_app_admin"
}

variable "postgres_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.6"
}

variable "postgres_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "postgres_allocated_storage" {
  description = "Initial PostgreSQL storage in GiB"
  type        = number
  default     = 200
}

variable "postgres_max_allocated_storage" {
  description = "Maximum autoscaled PostgreSQL storage in GiB"
  type        = number
  default     = 1000
}

variable "postgres_backup_retention_days" {
  description = "Backup retention for PITR"
  type        = number
  default     = 14
}

variable "postgres_backup_window" {
  description = "Daily backup window"
  type        = string
  default     = "01:00-03:00"
}

variable "postgres_maintenance_window" {
  description = "Weekly maintenance window"
  type        = string
  default     = "Sun:03:00-Sun:05:00"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone WAF and R2 permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account identifier"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone identifier for the production domain"
  type        = string
}

variable "r2_bucket_name" {
  description = "Bucket name for generated creative assets and exports"
  type        = string
  default     = "nexuszero-assets-prod"
}

variable "r2_location_hint" {
  description = "R2 region hint closest to the operating footprint"
  type        = string
  default     = "ENAM"
}

variable "primary_market_country" {
  description = "Primary country code used for WAF geo-tuned controls"
  type        = string
  default     = "AE"
}

variable "office_ip_allowlist" {
  description = "Trusted office or VPN egress IPs that bypass WAF challenges"
  type        = list(string)
  default     = []
}