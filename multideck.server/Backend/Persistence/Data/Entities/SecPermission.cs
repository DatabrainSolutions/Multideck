using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecPermission
{
    public Guid SecpermId { get; set; }

    public string SecpermCode { get; set; } = null!;

    public string SecpermName { get; set; } = null!;

    public string? SecpermModuleCode { get; set; }

    public string SecpermResourceTypeCode { get; set; } = null!;

    public string SecpermActionCode { get; set; } = null!;

    public string? SecpermDescription { get; set; }

    public bool SecpermIsSystem { get; set; }

    public bool SecpermIsActive { get; set; }

    public DateTime SecpermCreatedAt { get; set; }

    public virtual ICollection<SecApiclientScope> SecApiclientScopes { get; set; } = new List<SecApiclientScope>();

    public virtual ICollection<SecRolePermission> SecRolePermissions { get; set; } = new List<SecRolePermission>();

    public virtual SysSecpermissionAction SecpermActionCodeNavigation { get; set; } = null!;

    public virtual SysSubmoduleCode? SecpermModuleCodeNavigation { get; set; }
}
