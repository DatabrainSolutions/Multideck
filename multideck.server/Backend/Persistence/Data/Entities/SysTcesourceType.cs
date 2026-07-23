using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcesourceType
{
    public string TcesourceTypeCode { get; set; } = null!;

    public string TcesourceTypeName { get; set; } = null!;

    public string? TcesourceTypeDescription { get; set; }

    public bool TcesourceTypeIsActive { get; set; }

    public int TcesourceTypeSortOrder { get; set; }

    public virtual ICollection<TceDataSource> TceDataSources { get; set; } = new List<TceDataSource>();
}
