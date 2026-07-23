using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysModule
{
    public string ModuleCode { get; set; } = null!;

    public string? ModuleDescription { get; set; }

    public virtual ICollection<AccAptransHeader> AccAptransHeaders { get; set; } = new List<AccAptransHeader>();
}
