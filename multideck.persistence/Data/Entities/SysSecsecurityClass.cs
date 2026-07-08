using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecsecurityClass
{
    public string SecsecurityClassCode { get; set; } = null!;

    public string SecsecurityClassName { get; set; } = null!;

    public string? SecsecurityClassDescription { get; set; }

    public int SecsecurityClassRank { get; set; }

    public bool SecsecurityClassIsActive { get; set; }

    public virtual ICollection<SecRole> SecRoles { get; set; } = new List<SecRole>();

    public virtual ICollection<SecSensitiveFieldRule> SecSensitiveFieldRules { get; set; } = new List<SecSensitiveFieldRule>();

    public virtual ICollection<SecSensitiveField> SecSensitiveFields { get; set; } = new List<SecSensitiveField>();
}
