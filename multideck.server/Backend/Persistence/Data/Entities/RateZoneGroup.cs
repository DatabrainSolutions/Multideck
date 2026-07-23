using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateZoneGroup
{
    public Guid RatezoneGroupId { get; set; }

    public string RatezoneGroupCode { get; set; } = null!;

    public string RatezoneGroupName { get; set; } = null!;

    public string RatezoneGroupZoneTypeCode { get; set; } = null!;

    public Guid? RatezoneGroupOrgOfficeId { get; set; }

    public Guid? RatezoneGroupCarrierOrgId { get; set; }

    public Guid? RatezoneGroupCustomerOrgId { get; set; }

    public string? RatezoneGroupDescription { get; set; }

    public bool RatezoneGroupIsActive { get; set; }

    public DateTime RatezoneGroupCreatedAt { get; set; }

    public Guid? RatezoneGroupCreatedBy { get; set; }

    public virtual ICollection<RateLane> RateLaneRatelaneDestinationZoneGroups { get; set; } = new List<RateLane>();

    public virtual ICollection<RateLane> RateLaneRatelaneOriginZoneGroups { get; set; } = new List<RateLane>();

    public virtual ICollection<RateZoneMember> RateZoneMembers { get; set; } = new List<RateZoneMember>();

    public virtual OrgMaster? RatezoneGroupCarrierOrg { get; set; }

    public virtual CmpUser? RatezoneGroupCreatedByNavigation { get; set; }

    public virtual OrgMaster? RatezoneGroupCustomerOrg { get; set; }

    public virtual CmpOffice? RatezoneGroupOrgOffice { get; set; }

    public virtual SysRateZoneType RatezoneGroupZoneTypeCodeNavigation { get; set; } = null!;
}
