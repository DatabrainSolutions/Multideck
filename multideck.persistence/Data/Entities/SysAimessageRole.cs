using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAimessageRole
{
    public string AimrCode { get; set; } = null!;

    public string AimrName { get; set; } = null!;

    public int AimrSortOrder { get; set; }

    public bool AimrIsActive { get; set; }

    public DateTime AimrCreatedAt { get; set; }

    public virtual ICollection<AiMessage> AiMessages { get; set; } = new List<AiMessage>();
}
