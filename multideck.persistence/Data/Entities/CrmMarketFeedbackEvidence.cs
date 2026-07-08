using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMarketFeedbackEvidence
{
    public Guid CrmfeedbackEvidenceId { get; set; }

    public Guid CrmfeedbackEvidenceThemeId { get; set; }

    public Guid CrmfeedbackEvidenceFeedbackId { get; set; }

    public decimal? CrmfeedbackEvidenceRelevanceScore { get; set; }

    public DateTime CrmfeedbackEvidenceCreatedAt { get; set; }

    public virtual CrmMarketFeedbackItem CrmfeedbackEvidenceFeedback { get; set; } = null!;

    public virtual CrmMarketFeedbackTheme CrmfeedbackEvidenceTheme { get; set; } = null!;
}
