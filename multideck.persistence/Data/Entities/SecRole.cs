using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecRole
{
    public Guid SecroleId { get; set; }

    public string SecroleCode { get; set; } = null!;

    public string SecroleName { get; set; } = null!;

    public string? SecroleDescription { get; set; }

    public string SecroleSecurityClassCode { get; set; } = null!;

    public bool SecroleIsSystem { get; set; }

    public bool SecroleIsClientAdminAssignable { get; set; }

    public bool SecroleIsActive { get; set; }

    public DateTime SecroleCreatedAt { get; set; }

    public Guid? SecroleCreatedBy { get; set; }

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecRecordAccessOverride> SecRecordAccessOverrides { get; set; } = new List<SecRecordAccessOverride>();

    public virtual ICollection<SecRolePermission> SecRolePermissions { get; set; } = new List<SecRolePermission>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();

    public virtual ICollection<SecUserRole> SecUserRoles { get; set; } = new List<SecUserRole>();

    public virtual CmpUser? SecroleCreatedByNavigation { get; set; }

    public virtual SysSecsecurityClass SecroleSecurityClassCodeNavigation { get; set; } = null!;
}
