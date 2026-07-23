using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommContentFormat
{
    public string CommContentFormatCode { get; set; } = null!;

    public string CommContentFormatName { get; set; } = null!;

    public string? CommContentFormatDescription { get; set; }

    public int CommContentFormatSortOrder { get; set; }

    public bool CommContentFormatIsActive { get; set; }

    public DateTime CommContentFormatCreatedAt { get; set; }

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();
}
