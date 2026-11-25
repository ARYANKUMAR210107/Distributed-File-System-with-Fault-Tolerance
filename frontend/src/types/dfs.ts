export interface NodeInfo {
  node_id: string;
  name: string;
  url: string;
  status: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  chunks_used_bytes: number;
  chunk_count: number;
  primary_count: number;
  replica_count: number;
  response_time_ms: number | null;
  uptime_seconds: number | null;
  consecutive_failures: number;
  last_heartbeat: string | null;
  created_at: string;
}

export interface NodeHealthDetail {
  node_id: string;
  name: string;
  url: string;
  status: string;
  healthy: boolean;
  response_time_ms: number | null;
  uptime_seconds: number | null;
  last_heartbeat: string | null;
  error: string | null;
}

export interface NodeChunkInventory {
  node_id: string;
  chunks: Array<{
    chunk_id: string;
    size_bytes: number;
    sha256_hash: string;
    stored_at: string;
  }>;
  reachable: boolean;
  error: string | null;
}

export interface ChunkLocationInfo {
  node_id: string;
  node_name: string | null;
  node_url: string | null;
  node_status: string | null;
  is_primary: boolean;
  status: string;
  verified_at: string | null;
}

export interface ChunkInfo {
  chunk_id: string;
  file_id: string;
  chunk_index: number;
  chunk_size: number;
  sha256_hash: string;
  locations: ChunkLocationInfo[];
}

export interface FileRecord {
  file_id: string;
  filename: string;
  content_type: string;
  file_size: number;
  sha256_hash: string;
  chunk_size: number;
  total_chunks: number;
  replication_factor: number;
  status: string;
  created_at: string;
  stored_replicas: number;
  expected_replicas: number;
  replication_status: string;
}

export interface FileDetailResponse {
  file: FileRecord;
  chunks: ChunkInfo[];
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  file_size: number;
  sha256_hash: string;
  chunk_size: number;
  total_chunks: number;
  replication_factor: number;
  status: string;
  replication_status: string;
  integrity_verified: boolean;
  warnings: string[];
}

export interface FileIntegrityResponse {
  file_id: string;
  filename: string;
  overall_status: string;
  total_chunks: number;
  healthy_chunks: number;
  chunks: Array<{
    chunk_id: string;
    chunk_index: number;
    expected_sha256: string;
    healthy_replicas: number;
    corrupted_replicas: number;
    missing_replicas: number;
    offline_replicas: number;
    status: string;
    details: Array<{
      node_id: string;
      status: string;
      actual_sha256?: string;
    }>;
  }>;
}

export interface DistributionNodeEntry {
  node_id: string;
  node_name: string;
  node_status: string;
  chunk_status: string;
}

export interface FileDistributionResponse {
  file_id: string;
  filename: string;
  total_chunks: number;
  replication_factor: number;
  distribution: Array<{
    chunk_id: string;
    chunk_index: number;
    chunk_size: number;
    sha256_hash: string;
    primary_node: DistributionNodeEntry | null;
    replica_nodes: DistributionNodeEntry[];
  }>;
}

export interface SystemEvent {
  id: number;
  event_type: string;
  severity: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface ClusterStats {
  total_files: number;
  total_stored_bytes: number;
  total_chunks: number;
  total_replicas: number;
  active_nodes: number;
  offline_nodes: number;
  total_nodes: number;
  total_capacity_bytes: number;
  total_used_bytes: number;
  total_free_bytes: number;
  storage_utilization_percent: number;
  healthy_files: number;
  degraded_files: number;
}

export interface RuntimeSettings {
  chunk_size: number;
  replication_factor: number;
  max_upload_size_mb: number;
  health_check_interval_seconds: number;
  auto_replicate_on_failure: boolean;
}
