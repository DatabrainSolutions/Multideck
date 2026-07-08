using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecprincipalType
{
    public string SecprincipalTypeCode { get; set; } = null!;

    public string SecprincipalTypeName { get; set; } = null!;

    public string? SecprincipalTypeDescription { get; set; }

    public bool SecprincipalTypeIsActive { get; set; }

    public int SecprincipalTypeSortOrder { get; set; }

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecRecordAccessOverride> SecRecordAccessOverrides { get; set; } = new List<SecRecordAccessOverride>();
}
