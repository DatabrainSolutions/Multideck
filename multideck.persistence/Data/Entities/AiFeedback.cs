using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiFeedback
{
    public Guid AifId { get; set; }

    public Guid? AifTaskRunId { get; set; }

    public Guid? AifSuggestionId { get; set; }

    public int? AifRating { get; set; }

    public string? AifFeedbackType { get; set; }

    public string? AifComments { get; set; }

    public DateTime AifCreatedAt { get; set; }

    public Guid? AifCreatedBy { get; set; }

    public virtual AiSuggestion? AifSuggestion { get; set; }

    public virtual AiTaskRun? AifTaskRun { get; set; }
}
