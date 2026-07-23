using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommCallTranscriptSegment
{
    public Guid CommCallSegId { get; set; }

    public Guid CommCallSegCallId { get; set; }

    public int CommCallSegSequenceNo { get; set; }

    public string? CommCallSegSpeakerLabel { get; set; }

    public string? CommCallSegSpeakerType { get; set; }

    public decimal? CommCallSegStartSeconds { get; set; }

    public decimal? CommCallSegEndSeconds { get; set; }

    public string CommCallSegText { get; set; } = null!;

    public decimal? CommCallSegConfidenceScore { get; set; }

    public bool CommCallSegIsRedacted { get; set; }

    public string CommCallSegProviderMetadataJson { get; set; } = null!;

    public DateTime CommCallSegCreatedAt { get; set; }

    public virtual ICollection<CommCallActionItem> CommCallActionItems { get; set; } = new List<CommCallActionItem>();

    public virtual CommCallLog CommCallSegCall { get; set; } = null!;
}
