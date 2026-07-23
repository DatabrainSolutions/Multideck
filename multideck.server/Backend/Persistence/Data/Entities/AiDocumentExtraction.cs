using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiDocumentExtraction
{
    public Guid AideId { get; set; }

    public Guid? AideTaskRunId { get; set; }

    public Guid? AideJobDocumentId { get; set; }

    public string? AideDocumentTypeCode { get; set; }

    public string AideExtractionStatus { get; set; } = null!;

    public string AideExtractedJson { get; set; } = null!;

    public decimal? AideConfidenceScore { get; set; }

    public DateTime AideCreatedAt { get; set; }

    public virtual JobDocument? AideJobDocument { get; set; }

    public virtual AiTaskRun? AideTaskRun { get; set; }
}
