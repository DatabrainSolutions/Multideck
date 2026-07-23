using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecRecordAccessOverride
{
    public Guid SecrecordAccessId { get; set; }

    public string SecrecordAccessTargetTable { get; set; } = null!;

    public Guid SecrecordAccessTargetId { get; set; }

    public string SecrecordAccessPrincipalTypeCode { get; set; } = null!;

    public Guid? SecrecordAccessUserId { get; set; }

    public Guid? SecrecordAccessRoleId { get; set; }

    public Guid? SecrecordAccessOrgOfficeId { get; set; }

    public string? SecrecordAccessPermissionCode { get; set; }

    public string SecrecordAccessGrantStatusCode { get; set; } = null!;

    public string? SecrecordAccessReason { get; set; }

    public DateTime SecrecordAccessEffectiveFrom { get; set; }

    public DateTime? SecrecordAccessEffectiveTo { get; set; }

    public DateTime SecrecordAccessCreatedAt { get; set; }

    public Guid? SecrecordAccessCreatedBy { get; set; }

    public virtual CmpUser? SecrecordAccessCreatedByNavigation { get; set; }

    public virtual SysSecgrantStatus SecrecordAccessGrantStatusCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? SecrecordAccessOrgOffice { get; set; }

    public virtual SysSecprincipalType SecrecordAccessPrincipalTypeCodeNavigation { get; set; } = null!;

    public virtual SecRole? SecrecordAccessRole { get; set; }

    public virtual CmpUser? SecrecordAccessUser { get; set; }
}
