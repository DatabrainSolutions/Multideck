using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallSummaryNote
{
    public Guid CrmcallNoteId { get; set; }

    public Guid CrmcallNoteCallReviewId { get; set; }

    public Guid? CrmcallNoteCrmnoteId { get; set; }

    public string CrmcallNoteApprovedSummary { get; set; } = null!;

    public bool CrmcallNoteIsTranscriptRestricted { get; set; }

    public DateTime CrmcallNoteCreatedAt { get; set; }

    public Guid? CrmcallNoteCreatedBy { get; set; }

    public virtual CrmCallReview CrmcallNoteCallReview { get; set; } = null!;

    public virtual CmpUser? CrmcallNoteCreatedByNavigation { get; set; }

    public virtual CrmNote? CrmcallNoteCrmnote { get; set; }
}
