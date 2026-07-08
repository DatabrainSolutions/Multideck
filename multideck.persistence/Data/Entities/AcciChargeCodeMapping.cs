using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciChargeCodeMapping
{
    public Guid AccicmId { get; set; }

    public Guid AccicmConnectionId { get; set; }

    public Guid? AccicmLocalChargeCodeId { get; set; }

    public string AccicmLocalChargeCodeSnapshot { get; set; } = null!;

    public string AccicmDirectionCode { get; set; } = null!;

    public string? AccicmProviderItemId { get; set; }

    public string? AccicmProviderItemCode { get; set; }

    public string? AccicmProviderItemName { get; set; }

    public string? AccicmProviderAccountId { get; set; }

    public bool AccicmIsActive { get; set; }

    public DateTime AccicmCreatedAt { get; set; }

    public virtual AcciConnection AccicmConnection { get; set; } = null!;

    public virtual SysAccountingDirection AccicmDirectionCodeNavigation { get; set; } = null!;
}
