using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecscopeType
{
    public string SecscopeTypeCode { get; set; } = null!;

    public string SecscopeTypeName { get; set; } = null!;

    public string? SecscopeTypeDescription { get; set; }

    public bool SecscopeTypeIsActive { get; set; }

    public int SecscopeTypeSortOrder { get; set; }

    public virtual ICollection<SecApiclientScope> SecApiclientScopes { get; set; } = new List<SecApiclientScope>();

    public virtual ICollection<SecRoleScope> SecRoleScopes { get; set; } = new List<SecRoleScope>();
}
