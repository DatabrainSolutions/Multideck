using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiKnowledgeChunk
{
    public Guid AikcId { get; set; }

    public string AikcSourceTable { get; set; } = null!;

    public Guid? AikcSourceId { get; set; }

    public string? AikcSourceFieldPath { get; set; }

    public string? AikcChunkText { get; set; }

    public string AikcMetadataJson { get; set; } = null!;

    public string? AikcEmbeddingRef { get; set; }

    public bool AikcIsActive { get; set; }

    public DateTime AikcCreatedAt { get; set; }
}
