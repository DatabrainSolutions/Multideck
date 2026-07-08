using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityStakeholder
{
    public Guid CrmopptyStakeId { get; set; }

    public Guid CrmopptyStakeOpportunityId { get; set; }

    public Guid? CrmopptyStakeOrgContactId { get; set; }

    public Guid? CrmopptyStakeUserId { get; set; }

    public string CrmopptyStakeRole { get; set; } = null!;

    public string? CrmopptyStakeInfluenceLevel { get; set; }

    public bool CrmopptyStakeIsDecisionMaker { get; set; }

    public string? CrmopptyStakeNotes { get; set; }

    public DateTime CrmopptyStakeCreatedAt { get; set; }

    public virtual CrmOpportunity CrmopptyStakeOpportunity { get; set; } = null!;

    public virtual OrgContact? CrmopptyStakeOrgContact { get; set; }

    public virtual CmpUser? CrmopptyStakeUser { get; set; }
}
