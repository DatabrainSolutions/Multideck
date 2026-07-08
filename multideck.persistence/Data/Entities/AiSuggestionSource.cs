using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiSuggestionSource
{
    public Guid AissrcId { get; set; }

    public Guid AissrcSuggestionId { get; set; }

    public string AissrcSourceTable { get; set; } = null!;

    public Guid? AissrcSourceId { get; set; }

    public string? AissrcSourceFieldPath { get; set; }

    public string? AissrcEvidenceText { get; set; }

    public string AissrcEvidenceJson { get; set; } = null!;

    public DateTime AissrcCreatedAt { get; set; }

    public virtual AiSuggestion AissrcSuggestion { get; set; } = null!;
}
