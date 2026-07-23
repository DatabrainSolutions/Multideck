using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCampaignTouchpoint
{
    public Guid CrmcampaignTouchId { get; set; }

    public Guid CrmcampaignTouchCampaignId { get; set; }

    public Guid? CrmcampaignTouchMemberId { get; set; }

    public Guid? CrmcampaignTouchActivityId { get; set; }

    public string? CrmcampaignTouchChannelCode { get; set; }

    public DateTime? CrmcampaignTouchPlannedAt { get; set; }

    public DateTime? CrmcampaignTouchCompletedAt { get; set; }

    public string? CrmcampaignTouchOutcomeCode { get; set; }

    public string? CrmcampaignTouchNotes { get; set; }

    public virtual CrmActivity? CrmcampaignTouchActivity { get; set; }

    public virtual CrmCampaign CrmcampaignTouchCampaign { get; set; } = null!;

    public virtual CrmCampaignMember? CrmcampaignTouchMember { get; set; }

    public virtual SysCrmactivityOutcome? CrmcampaignTouchOutcomeCodeNavigation { get; set; }
}
