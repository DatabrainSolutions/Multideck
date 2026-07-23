using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPermission
{
    public Guid SysPermissionId { get; set; }

    public string SysPermissionValue { get; set; } = null!;

    public string SysPermissionGroup { get; set; } = null!;

    public string SysPermissionName { get; set; } = null!;

    public string SysPermissionDescription { get; set; } = null!;

    public bool SysPermissionIsDangerous { get; set; }

    public DateTime SysPermissionCreatedAtUtc { get; set; }

    public virtual ICollection<SysUserRole> SysUserRoles { get; set; } = new List<SysUserRole>();
}
