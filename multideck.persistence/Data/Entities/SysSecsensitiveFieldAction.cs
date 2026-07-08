using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecsensitiveFieldAction
{
    public string SecsensActionCode { get; set; } = null!;

    public string SecsensActionName { get; set; } = null!;

    public string? SecsensActionDescription { get; set; }

    public bool SecsensActionIsActive { get; set; }

    public int SecsensActionSortOrder { get; set; }

    public virtual ICollection<SecSensitiveFieldRule> SecSensitiveFieldRules { get; set; } = new List<SecSensitiveFieldRule>();
}
