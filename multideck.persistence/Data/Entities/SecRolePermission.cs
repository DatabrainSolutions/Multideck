using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecRolePermission
{
    public Guid SecrolePermId { get; set; }

    public Guid SecrolePermRoleId { get; set; }

    public Guid SecrolePermPermissionId { get; set; }

    public string SecrolePermGrantStatusCode { get; set; } = null!;

    public string SecrolePermGrantActionCode { get; set; } = null!;

    public string SecrolePermConditionsJson { get; set; } = null!;

    public DateTime SecrolePermCreatedAt { get; set; }

    public Guid? SecrolePermCreatedBy { get; set; }

    public virtual CmpUser? SecrolePermCreatedByNavigation { get; set; }

    public virtual SysSecpermissionAction SecrolePermGrantActionCodeNavigation { get; set; } = null!;

    public virtual SysSecgrantStatus SecrolePermGrantStatusCodeNavigation { get; set; } = null!;

    public virtual SecPermission SecrolePermPermission { get; set; } = null!;

    public virtual SecRole SecrolePermRole { get; set; } = null!;
}
