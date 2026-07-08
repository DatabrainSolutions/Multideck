using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecCredentialGrant
{
    public Guid SeccredGrantId { get; set; }

    public Guid SeccredGrantCredentialId { get; set; }

    public string SeccredGrantPrincipalTypeCode { get; set; } = null!;

    public Guid? SeccredGrantUserId { get; set; }

    public Guid? SeccredGrantRoleId { get; set; }

    public Guid? SeccredGrantApiclientId { get; set; }

    public string SeccredGrantActionCode { get; set; } = null!;

    public string SeccredGrantStatusCode { get; set; } = null!;

    public string SeccredGrantConditionsJson { get; set; } = null!;

    public DateTime SeccredGrantCreatedAt { get; set; }

    public Guid? SeccredGrantCreatedBy { get; set; }

    public virtual SysSecpermissionAction SeccredGrantActionCodeNavigation { get; set; } = null!;

    public virtual SecApiclient? SeccredGrantApiclient { get; set; }

    public virtual CmpUser? SeccredGrantCreatedByNavigation { get; set; }

    public virtual SecCredentialReference SeccredGrantCredential { get; set; } = null!;

    public virtual SysSecprincipalType SeccredGrantPrincipalTypeCodeNavigation { get; set; } = null!;

    public virtual SecRole? SeccredGrantRole { get; set; }

    public virtual SysSecgrantStatus SeccredGrantStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? SeccredGrantUser { get; set; }
}
