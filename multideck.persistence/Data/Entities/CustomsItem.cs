using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsItem
{
    public Guid CustiId { get; set; }

    public Guid CustiCustomsId { get; set; }

    public int CustiItemNumber { get; set; }

    public string? CustiCommodityCode { get; set; }

    public string CustiDescriptionOfGoods { get; set; } = null!;

    public string? CustiCountryOfOriginCodeSnapshot { get; set; }

    public string? CustiCountryOfDispatchCodeSnapshot { get; set; }

    public string? CustiCountryOfDestinationCodeSnapshot { get; set; }

    public decimal? CustiNetMass { get; set; }

    public decimal? CustiGrossMass { get; set; }

    public decimal? CustiSupplementaryUnits { get; set; }

    public decimal? CustiItemValueAmount { get; set; }

    public string? CustiItemValueCurrencyCodeSnapshot { get; set; }

    public string? CustiProcedureCode { get; set; }

    public string? CustiPreviousProcedureCode { get; set; }

    public string CustiAdditionalProcedureCodesJson { get; set; } = null!;

    public string CustiItemPayloadJson { get; set; } = null!;

    public DateTime CustiCreatedAt { get; set; }

    public Guid? CustiJobCargoId { get; set; }

    public virtual CustomsDeclaration CustiCustoms { get; set; } = null!;

    public virtual JobCargo? CustiJobCargo { get; set; }

    public virtual ICollection<CustomsDataElement> CustomsDataElements { get; set; } = new List<CustomsDataElement>();

    public virtual ICollection<CustomsDocument> CustomsDocuments { get; set; } = new List<CustomsDocument>();

    public virtual ICollection<CustomsParty> CustomsParties { get; set; } = new List<CustomsParty>();

    public virtual ICollection<CustomsValidationResult> CustomsValidationResults { get; set; } = new List<CustomsValidationResult>();
}
