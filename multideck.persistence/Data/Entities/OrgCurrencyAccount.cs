using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgCurrencyAccount
{
    public Guid OrgId { get; set; }

    public Guid OrgCurrencyCode { get; set; }

    public string? OrgCurrencySalesLedgerCode { get; set; }

    public string? OrgCurrencyPurchaseLedgerCode { get; set; }
}
