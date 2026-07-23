using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmstransactionType
{
    public string WmstransactionTypeCode { get; set; } = null!;

    public string WmstransactionTypeName { get; set; } = null!;

    public string? WmstransactionTypeDescription { get; set; }

    public bool WmstransactionTypeAffectsOnHand { get; set; }

    public int WmstransactionTypeDefaultSign { get; set; }

    public bool WmstransactionTypeIsActive { get; set; }

    public int WmstransactionTypeSortOrder { get; set; }

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();
}
