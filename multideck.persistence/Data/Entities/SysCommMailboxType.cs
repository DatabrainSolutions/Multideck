using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommMailboxType
{
    public string CommMailboxTypeCode { get; set; } = null!;

    public string CommMailboxTypeName { get; set; } = null!;

    public string? CommMailboxTypeDescription { get; set; }

    public int CommMailboxTypeSortOrder { get; set; }

    public bool CommMailboxTypeIsActive { get; set; }

    public DateTime CommMailboxTypeCreatedAt { get; set; }

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();
}
