using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecUserRole
{
    public Guid SecuserRoleId { get; set; }

    public Guid SecuserRoleUserId { get; set; }

    public Guid SecuserRoleRoleId { get; set; }

    public string SecuserRoleStatusCode { get; set; } = null!;

    public DateTime SecuserRoleEffectiveFrom { get; set; }

    public DateTime? SecuserRoleEffectiveTo { get; set; }

    public string? SecuserRoleReason { get; set; }

    public DateTime SecuserRoleCreatedAt { get; set; }

    public Guid? SecuserRoleCreatedBy { get; set; }

    public virtual CmpUser? SecuserRoleCreatedByNavigation { get; set; }

    public virtual SecRole SecuserRoleRole { get; set; } = null!;

    public virtual SysSecgrantStatus SecuserRoleStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser SecuserRoleUser { get; set; } = null!;
}
