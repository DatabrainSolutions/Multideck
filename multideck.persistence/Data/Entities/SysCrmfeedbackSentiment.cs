using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmfeedbackSentiment
{
    public string CrmfeedbackSentimentCode { get; set; } = null!;

    public string CrmfeedbackSentimentName { get; set; } = null!;

    public decimal? CrmfeedbackSentimentScore { get; set; }

    public bool CrmfeedbackSentimentIsActive { get; set; }

    public int CrmfeedbackSentimentSortOrder { get; set; }

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmSentimentSignal> CrmSentimentSignals { get; set; } = new List<CrmSentimentSignal>();
}
