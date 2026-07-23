using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalUserOrganisation
{
    public Guid PortalUserOrgId { get; set; }

    public Guid PortalUserOrgPortalUserId { get; set; }

    public Guid PortalUserOrgOrgId { get; set; }

    public Guid? PortalUserOrgContactId { get; set; }

    public string PortalUserOrgAudienceTypeCode { get; set; } = null!;

    public string PortalUserOrgStatusCode { get; set; } = null!;

    public bool PortalUserOrgIsPrimary { get; set; }

    public bool PortalUserOrgCanManageOrgUsers { get; set; }

    public string PortalUserOrgFieldPolicyJson { get; set; } = null!;

    public DateTime PortalUserOrgCreatedAt { get; set; }

    public Guid? PortalUserOrgCreatedBy { get; set; }

    public virtual SysPortalAudienceType PortalUserOrgAudienceTypeCodeNavigation { get; set; } = null!;

    public virtual OrgContact? PortalUserOrgContact { get; set; }

    public virtual CmpUser? PortalUserOrgCreatedByNavigation { get; set; }

    public virtual OrgMaster PortalUserOrgOrg { get; set; } = null!;

    public virtual PortalUser PortalUserOrgPortalUser { get; set; } = null!;

    public virtual SysPortalAccessStatus PortalUserOrgStatusCodeNavigation { get; set; } = null!;
}
