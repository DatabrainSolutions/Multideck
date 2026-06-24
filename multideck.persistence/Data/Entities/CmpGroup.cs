using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpGroup
{
    public Guid GroupId { get; set; }

    public string GroupName { get; set; } = null!;

    public string? GroupNotes { get; set; }

    public Guid? GroupCreatedBy { get; set; }

    public DateTime? GroupCreatedDate { get; set; }

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
