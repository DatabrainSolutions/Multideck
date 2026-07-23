using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysICustomsEnvironment
{
    public string IcenvCode { get; set; } = null!;

    public string IcenvName { get; set; } = null!;

    public string? IcenvDescription { get; set; }

    public int IcenvSortOrder { get; set; }

    public bool IcenvIsActive { get; set; }

    public DateTime IcenvCreatedAt { get; set; }

    public virtual ICollection<IcusApiConnection> IcusApiConnections { get; set; } = new List<IcusApiConnection>();

    public virtual ICollection<UkcCustomsSetting> UkcCustomsSettings { get; set; } = new List<UkcCustomsSetting>();
}
