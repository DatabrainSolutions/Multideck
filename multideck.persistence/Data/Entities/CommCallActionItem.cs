using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommCallActionItem
{
    public Guid CommCallActionId { get; set; }

    public Guid CommCallActionCallId { get; set; }

    public Guid? CommCallActionAioutputId { get; set; }

    public string? CommCallActionActionTypeCode { get; set; }

    public string CommCallActionTitle { get; set; } = null!;

    public string? CommCallActionDescription { get; set; }

    public DateTime? CommCallActionDueAt { get; set; }

    public decimal? CommCallActionConfidenceScore { get; set; }

    public Guid? CommCallActionSourceSegmentId { get; set; }

    public string CommCallActionMetadataJson { get; set; } = null!;

    public DateTime CommCallActionCreatedAt { get; set; }

    public virtual CommCallAioutput? CommCallActionAioutput { get; set; }

    public virtual CommCallLog CommCallActionCall { get; set; } = null!;

    public virtual CommCallTranscriptSegment? CommCallActionSourceSegment { get; set; }

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidates { get; set; } = new List<CrmCallActionCandidate>();
}
