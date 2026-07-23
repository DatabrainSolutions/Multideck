using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecgrantStatus
{
    public string SecgrantStatusCode { get; set; } = null!;

    public string SecgrantStatusName { get; set; } = null!;

    public string? SecgrantStatusDescription { get; set; }

    public bool SecgrantStatusIsActive { get; set; }

    public int SecgrantStatusSortOrder { get; set; }

    public virtual ICollection<SecApiclientScope> SecApiclientScopes { get; set; } = new List<SecApiclientScope>();

    public virtual ICollection<SecAuthIdentityLink> SecAuthIdentityLinks { get; set; } = new List<SecAuthIdentityLink>();

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecRecordAccessOverride> SecRecordAccessOverrides { get; set; } = new List<SecRecordAccessOverride>();

    public virtual ICollection<SecRolePermission> SecRolePermissions { get; set; } = new List<SecRolePermission>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();

    public virtual ICollection<SecSupportAccessSession> SecSupportAccessSessions { get; set; } = new List<SecSupportAccessSession>();

    public virtual ICollection<SecUserOfficeAccess> SecUserOfficeAccesses { get; set; } = new List<SecUserOfficeAccess>();

    public virtual ICollection<SecUserRole> SecUserRoles { get; set; } = new List<SecUserRole>();
}
