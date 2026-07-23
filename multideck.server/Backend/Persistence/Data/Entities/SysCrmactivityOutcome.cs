using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmactivityOutcome
{
    public string CrmactOutcomeCode { get; set; } = null!;

    public string CrmactOutcomeName { get; set; } = null!;

    public string? CrmactOutcomeDescription { get; set; }

    public bool? CrmactOutcomeIsPositive { get; set; }

    public bool CrmactOutcomeIsActive { get; set; }

    public int CrmactOutcomeSortOrder { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmCampaignTouchpoint> CrmCampaignTouchpoints { get; set; } = new List<CrmCampaignTouchpoint>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();
}
