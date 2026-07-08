using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalRecordShare
{
    public Guid PortalShareId { get; set; }

    public Guid? PortalShareSiteId { get; set; }

    public string PortalShareResourceTypeCode { get; set; } = null!;

    public string PortalShareTargetTable { get; set; } = null!;

    public Guid PortalShareTargetId { get; set; }

    public Guid? PortalShareJobId { get; set; }

    public Guid? PortalShareOrgId { get; set; }

    public Guid? PortalShareContactId { get; set; }

    public Guid? PortalSharePortalUserId { get; set; }

    public Guid? PortalShareRoleId { get; set; }

    public string PortalShareStatusCode { get; set; } = null!;

    public string PortalShareAllowedActionsJson { get; set; } = null!;

    public string PortalShareFieldAllowListJson { get; set; } = null!;

    public string PortalShareFieldDenyListJson { get; set; } = null!;

    public string? PortalShareReason { get; set; }

    public string? PortalShareSourceType { get; set; }

    public string? PortalShareSourceTable { get; set; }

    public Guid? PortalShareSourceId { get; set; }

    public bool PortalShareIsInherited { get; set; }

    public DateTime PortalShareValidFrom { get; set; }

    public DateTime? PortalShareValidUntil { get; set; }

    public DateTime PortalShareCreatedAt { get; set; }

    public Guid? PortalShareCreatedBy { get; set; }

    public DateTime? PortalShareRevokedAt { get; set; }

    public Guid? PortalShareRevokedBy { get; set; }

    public string? PortalShareRevocationReason { get; set; }

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual OrgContact? PortalShareContact { get; set; }

    public virtual CmpUser? PortalShareCreatedByNavigation { get; set; }

    public virtual JobHeader? PortalShareJob { get; set; }

    public virtual OrgMaster? PortalShareOrg { get; set; }

    public virtual PortalUser? PortalSharePortalUser { get; set; }

    public virtual SysPortalResourceType PortalShareResourceTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalShareRevokedByNavigation { get; set; }

    public virtual PortalRole? PortalShareRole { get; set; }

    public virtual PortalSite? PortalShareSite { get; set; }

    public virtual SysPortalAccessStatus PortalShareStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();
}
