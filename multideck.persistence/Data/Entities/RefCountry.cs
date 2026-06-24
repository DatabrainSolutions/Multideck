using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RefCountry
{
    public Guid? RnPk { get; set; }

    public string? RnCode { get; set; }

    public bool? RnIsActive { get; set; }

    public bool? RnIsSystem { get; set; }

    public string? RnDesc { get; set; }

    public string? RnEconomicGrouping { get; set; }

    public string? RnCountryDialingCode { get; set; }

    public string? RnAddressFormattingRule { get; set; }

    public string? RnPostcodeValidationRule { get; set; }

    public string? RnStateProvinceValidationRule { get; set; }

    public string? RnRxNklocalCurrency { get; set; }

    public string? RnRxNkairWaybillCurrency { get; set; }

    public string? RnIsoAlpha3Code { get; set; }

    public string? RnIsoNumericUnm49code { get; set; }

    public string? RnValidationStatus { get; set; }

    public short? RnAutoVersion { get; set; }

    public DateTime? RnSystemCreateTimeUtc { get; set; }

    public string? RnSystemCreateUser { get; set; }

    public DateTime? RnSystemLastEditTimeUtc { get; set; }

    public string? RnSystemLastEditUser { get; set; }

    public bool? RnIsSanctioned { get; set; }
}
