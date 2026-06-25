using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysUserRole
{
    public Guid SysUserRoleId { get; set; }

    public string SysUserRoleName { get; set; } = null!;

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
