using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecpermissionAction
{
    public string SecpermActionCode { get; set; } = null!;

    public string SecpermActionName { get; set; } = null!;

    public string? SecpermActionDescription { get; set; }

    public bool SecpermActionIsActive { get; set; }

    public int SecpermActionSortOrder { get; set; }

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecPermission> SecPermissions { get; set; } = new List<SecPermission>();

    public virtual ICollection<SecRolePermission> SecRolePermissions { get; set; } = new List<SecRolePermission>();
}
