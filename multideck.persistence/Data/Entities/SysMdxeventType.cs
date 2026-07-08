using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxeventType
{
    public string MdxeventTypeCode { get; set; } = null!;

    public string MdxeventTypeName { get; set; } = null!;

    public string? MdxeventTypeDescription { get; set; }

    public int MdxeventTypeSortOrder { get; set; }

    public bool MdxeventTypeIsActive { get; set; }

    public DateTime MdxeventTypeCreatedAt { get; set; }

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();
}
