using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCampaign
{
    public Guid CrmcampaignId { get; set; }

    public string CrmcampaignCode { get; set; } = null!;

    public string CrmcampaignName { get; set; } = null!;

    public string CrmcampaignTypeCode { get; set; } = null!;

    public Guid? CrmcampaignOwnerUserId { get; set; }

    public Guid? CrmcampaignOrgOfficeId { get; set; }

    public string? CrmcampaignTargetSegment { get; set; }

    public string? CrmcampaignTargetModeCode { get; set; }

    public string? CrmcampaignTargetTradeLane { get; set; }

    public string CrmcampaignStatus { get; set; } = null!;

    public DateOnly? CrmcampaignStartDate { get; set; }

    public DateOnly? CrmcampaignEndDate { get; set; }

    public decimal? CrmcampaignBudgetAmount { get; set; }

    public string? CrmcampaignCurrencyCode { get; set; }

    public string CrmcampaignGoalsJson { get; set; } = null!;

    public DateTime CrmcampaignCreatedAt { get; set; }

    public Guid? CrmcampaignCreatedBy { get; set; }

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmCampaignMember> CrmCampaignMembers { get; set; } = new List<CrmCampaignMember>();

    public virtual ICollection<CrmCampaignResult> CrmCampaignResults { get; set; } = new List<CrmCampaignResult>();

    public virtual ICollection<CrmCampaignTouchpoint> CrmCampaignTouchpoints { get; set; } = new List<CrmCampaignTouchpoint>();

    public virtual CmpUser? CrmcampaignCreatedByNavigation { get; set; }

    public virtual CmpOffice? CrmcampaignOrgOffice { get; set; }

    public virtual CmpUser? CrmcampaignOwnerUser { get; set; }

    public virtual SysCrmcampaignType CrmcampaignTypeCodeNavigation { get; set; } = null!;
}
