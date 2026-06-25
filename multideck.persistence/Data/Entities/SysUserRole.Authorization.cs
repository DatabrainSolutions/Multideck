using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysUserRole
{
    public virtual ICollection<SysPermission> Permissions { get; set; } = new List<SysPermission>();
}
