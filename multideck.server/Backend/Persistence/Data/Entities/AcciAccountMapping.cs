using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciAccountMapping
{
    public Guid AcciamId { get; set; }

    public Guid AcciamConnectionId { get; set; }

    public string AcciamDirectionCode { get; set; } = null!;

    public Guid? AcciamLocalChargeCodeId { get; set; }

    public string? AcciamLocalChargeCodeSnapshot { get; set; }

    public string? AcciamLocalContextCode { get; set; }

    public string AcciamProviderAccountId { get; set; } = null!;

    public string? AcciamProviderAccountCode { get; set; }

    public string? AcciamProviderAccountName { get; set; }

    public bool AcciamIsDefault { get; set; }

    public bool AcciamIsActive { get; set; }

    public DateTime AcciamCreatedAt { get; set; }

    public virtual AcciConnection AcciamConnection { get; set; } = null!;

    public virtual SysAccountingDirection AcciamDirectionCodeNavigation { get; set; } = null!;
}
