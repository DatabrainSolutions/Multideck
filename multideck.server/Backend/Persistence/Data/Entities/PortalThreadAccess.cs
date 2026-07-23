using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalThreadAccess
{
    public Guid PortalThreadAccessId { get; set; }

    public Guid? PortalThreadAccessSiteId { get; set; }

    public Guid PortalThreadAccessCommThreadId { get; set; }

    public Guid? PortalThreadAccessPortalUserId { get; set; }

    public Guid? PortalThreadAccessOrgId { get; set; }

    public Guid? PortalThreadAccessRecordShareId { get; set; }

    public bool PortalThreadAccessCanRead { get; set; }

    public bool PortalThreadAccessCanReply { get; set; }

    public bool PortalThreadAccessCanAttachFiles { get; set; }

    public string PortalThreadAccessStatusCode { get; set; } = null!;

    public DateTime PortalThreadAccessCreatedAt { get; set; }

    public Guid? PortalThreadAccessCreatedBy { get; set; }

    public virtual CommThread PortalThreadAccessCommThread { get; set; } = null!;

    public virtual CmpUser? PortalThreadAccessCreatedByNavigation { get; set; }

    public virtual OrgMaster? PortalThreadAccessOrg { get; set; }

    public virtual PortalUser? PortalThreadAccessPortalUser { get; set; }

    public virtual PortalRecordShare? PortalThreadAccessRecordShare { get; set; }

    public virtual PortalSite? PortalThreadAccessSite { get; set; }

    public virtual SysPortalAccessStatus PortalThreadAccessStatusCodeNavigation { get; set; } = null!;
}
