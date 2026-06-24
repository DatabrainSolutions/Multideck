using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAirline
{
    public Guid? RmPk { get; set; }

    public bool? RmIsSystem { get; set; }

    public string? RmAirlineName1 { get; set; }

    public string? RmAirlineName2 { get; set; }

    public string? RmAccountingCode { get; set; }

    public string? RmThreeLetterCode { get; set; }

    public string? RmTwoCharacterCode { get; set; }

    public bool? RmDuplicateFlagIndicator { get; set; }

    public string? RmAddressLine1 { get; set; }

    public string? RmAddressLine2 { get; set; }

    public string? RmAirlineCity { get; set; }

    public string? RmAirlineState { get; set; }

    public string? RmAirlineCountry { get; set; }

    public string? RmAirlinePostalCode { get; set; }

    public string? RmReservationsDeptTeletype { get; set; }

    public string? RmReservationsContactName { get; set; }

    public string? RmReservationsContactTitle { get; set; }

    public string? RmReservationsContactTeletype { get; set; }

    public string? RmEmergencyTeletype { get; set; }

    public string? RmEmergencyContactName { get; set; }

    public string? RmEmergencyContactTitle { get; set; }

    public bool? RmMembershipFlagSita { get; set; }

    public bool? RmMembershipFlagArinc { get; set; }

    public bool? RmMembershipFlagIata { get; set; }

    public bool? RmMembershipFlagAta { get; set; }

    public string? RmTypeOfOperationsCode { get; set; }

    public string? RmAccountingSecondaryFlag { get; set; }

    public string? RmAirlinePrefix { get; set; }

    public string? RmAirlinePrefixSecondaryFlag { get; set; }

    public string? RmEagleAddedAirlinePrefixOrAccountingCode { get; set; }

    public string? RmLabelShortName { get; set; }

    public bool? RmIsCasscontrolled { get; set; }

    public string? RmContactNameOciidentifier { get; set; }

    public string? RmContactPhoneOciidentifier { get; set; }

    public short? RmAutoVersion { get; set; }

    public bool? RmIsActive { get; set; }

    public DateTime? RmSystemCreateTimeUtc { get; set; }

    public string? RmSystemCreateUser { get; set; }

    public DateTime? RmSystemLastEditTimeUtc { get; set; }

    public string? RmSystemLastEditUser { get; set; }

    public bool? RmIsUpdatable { get; set; }

    public string? RmRnNkairlineCountry { get; set; }

    public byte[]? RmAirlineLogo { get; set; }
}
