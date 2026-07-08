using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecUserEffectivePermission
{
    public Guid? UserId { get; set; }

    public Guid? RoleId { get; set; }

    public string? RoleCode { get; set; }

    public string? RoleName { get; set; }

    public Guid? PermissionId { get; set; }

    public string? PermissionCode { get; set; }

    public string? ModuleCode { get; set; }

    public string? ResourceTypeCode { get; set; }

    public string? ActionCode { get; set; }

    public string? GrantActionCode { get; set; }

    public DateTime? EffectiveFrom { get; set; }

    public DateTime? EffectiveTo { get; set; }
}
