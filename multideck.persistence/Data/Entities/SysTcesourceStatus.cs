using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcesourceStatus
{
    public string TcesourceStatusCode { get; set; } = null!;

    public string TcesourceStatusName { get; set; } = null!;

    public string? TcesourceStatusDescription { get; set; }

    public bool TcesourceStatusIsActiveSource { get; set; }

    public bool TcesourceStatusIsActive { get; set; }

    public int TcesourceStatusSortOrder { get; set; }

    public virtual ICollection<TceDataSource> TceDataSources { get; set; } = new List<TceDataSource>();
}
