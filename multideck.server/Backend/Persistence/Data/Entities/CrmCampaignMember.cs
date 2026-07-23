using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCampaignMember
{
    public Guid CrmcampaignMemberId { get; set; }

    public Guid CrmcampaignMemberCampaignId { get; set; }

    public Guid? CrmcampaignMemberOrgId { get; set; }

    public Guid? CrmcampaignMemberLeadId { get; set; }

    public Guid? CrmcampaignMemberOpportunityId { get; set; }

    public Guid? CrmcampaignMemberOrgContactId { get; set; }

    public string CrmcampaignMemberStatus { get; set; } = null!;

    public DateTime CrmcampaignMemberAddedAt { get; set; }

    public DateTime? CrmcampaignMemberResponseAt { get; set; }

    public string? CrmcampaignMemberResponseSummary { get; set; }

    public virtual ICollection<CrmCampaignTouchpoint> CrmCampaignTouchpoints { get; set; } = new List<CrmCampaignTouchpoint>();

    public virtual CrmCampaign CrmcampaignMemberCampaign { get; set; } = null!;

    public virtual CrmLead? CrmcampaignMemberLead { get; set; }

    public virtual CrmOpportunity? CrmcampaignMemberOpportunity { get; set; }

    public virtual OrgMaster? CrmcampaignMemberOrg { get; set; }

    public virtual OrgContact? CrmcampaignMemberOrgContact { get; set; }
}
