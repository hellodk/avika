"""
Configuration module for AI Engine
"""
import os
from pydantic import BaseModel, Field


class ModelConfig(BaseModel):
    """Configuration for anomaly detection models"""
    n_trees: int = Field(default=10, ge=1, le=100, description="Number of trees in HalfSpaceTrees")
    height: int = Field(default=8, ge=4, le=16, description="Height of each tree")
    window_size: int = Field(default=200, ge=50, le=1000, description="Window size for streaming")
    seed: int = Field(default=42, description="Random seed for reproducibility")
    anomaly_threshold: float = Field(default=0.8, ge=0.0, le=1.0, description="Threshold for anomaly detection")
    warning_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Threshold for warnings")


class KafkaConfig(BaseModel):
    """Configuration for Kafka connection"""
    bootstrap_servers: list[str] = Field(default=["redpanda:9092"], description="Kafka bootstrap servers")
    consumer_group: str = Field(default="ai-engine-rca", description="Consumer group ID")
    auto_offset_reset: str = Field(default="latest", description="Auto offset reset policy")
    enable_auto_commit: bool = Field(default=True, description="Enable auto commit")


class Config(BaseModel):
    """Main configuration for AI Engine"""
    model: ModelConfig = Field(default_factory=ModelConfig)
    kafka: KafkaConfig = Field(default_factory=KafkaConfig)
    log_buffer_size: int = Field(default=1000, ge=100, le=10000, description="Size of log buffer for RCA")
    
    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables"""
        return cls(
            model=ModelConfig(
                n_trees=int(os.getenv("AI_MODEL_N_TREES", "10")),
                height=int(os.getenv("AI_MODEL_HEIGHT", "8")),
                window_size=int(os.getenv("AI_MODEL_WINDOW_SIZE", "200")),
                seed=int(os.getenv("AI_MODEL_SEED", "42")),
                anomaly_threshold=float(os.getenv("AI_ANOMALY_THRESHOLD", "0.8")),
                warning_threshold=float(os.getenv("AI_WARNING_THRESHOLD", "0.5")),
            ),
            kafka=KafkaConfig(
                bootstrap_servers=os.getenv("KAFKA_BROKERS", "redpanda:9092").split(","),
                consumer_group=os.getenv("KAFKA_CONSUMER_GROUP", "ai-engine-rca"),
            ),
            log_buffer_size=int(os.getenv("LOG_BUFFER_SIZE", "1000")),
        )
