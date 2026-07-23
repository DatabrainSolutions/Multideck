using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiContextChunk
{
    public Guid AichId { get; set; }

    public Guid AichContextItemId { get; set; }

    public int AichChunkNo { get; set; }

    public string AichChunkText { get; set; } = null!;

    public string? AichChunkHash { get; set; }

    public int? AichTokenCount { get; set; }

    public Guid? AichEmbeddingModelId { get; set; }

    public string? AichEmbeddingRef { get; set; }

    public string AichMetadataJson { get; set; } = null!;

    public bool AichIsActive { get; set; }

    public DateTime AichCreatedAt { get; set; }

    public virtual AiContextItem AichContextItem { get; set; } = null!;

    public virtual AiModel? AichEmbeddingModel { get; set; }
}
