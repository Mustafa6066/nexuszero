{{- define "nexuszero-workers.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "nexuszero-workers.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "nexuszero-workers.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}